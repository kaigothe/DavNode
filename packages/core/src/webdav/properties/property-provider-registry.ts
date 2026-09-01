import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from './property-provider.interface.js';

/**
 * A composite of every registered {@link PropertyProvider} for one
 * resource type `TResource`: it *is* one itself
 * (`listLiveProperties`/`isLiveProperty` aggregate across all registered
 * providers), so PROPFIND/PROPPATCH can depend on a single registry
 * instance without knowing how many providers back it.
 *
 * One instance per resource tree — e.g.
 * `PropertyProviderRegistry<WebDavResource>` for the file tree,
 * `PropertyProviderRegistry<PrincipalTreeResource>` for `/principals/`
 * (M3) — since a provider for one tree's resource type can't sensibly
 * register into another's.
 *
 * Unlike `AuthProviderRegistry` (M1), which resolves exactly one
 * provider per auth scheme, property providers are additive — a
 * resource's properties come from every registered provider at once
 * (core WebDAV properties, M3's ACL properties, M5/M6's CalDAV/CardDAV
 * properties), so registering doesn't replace an existing entry the way
 * `AuthProviderRegistry.register` does.
 */
export class PropertyProviderRegistry<TResource>
  implements PropertyProvider<TResource>
{
  private readonly providers: PropertyProvider<TResource>[] = [];

  /** Adds `provider` to the set consulted by `listLiveProperties`/`isLiveProperty`. */
  register(provider: PropertyProvider<TResource>): void {
    this.providers.push(provider);
  }

  /** The union of every registered provider's live properties for `resource`. */
  async listLiveProperties(
    resource: TResource,
    context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    const perProvider = await Promise.all(
      this.providers.map((provider) =>
        provider.listLiveProperties(resource, context),
      ),
    );
    return perProvider.flat();
  }

  /** Whether any registered provider treats `namespace`/`name` as a live property. */
  isLiveProperty(namespace: string, name: string): boolean {
    return this.providers.some((provider) =>
      provider.isLiveProperty(namespace, name),
    );
  }
}
