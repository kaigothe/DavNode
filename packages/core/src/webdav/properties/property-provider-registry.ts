import type {
  PropertyProvider,
  PropertyValue,
  WebDavResource,
} from './property-provider.interface.js';

/**
 * A composite of every registered {@link PropertyProvider}: it *is* one
 * itself (`listLiveProperties`/`isLiveProperty` aggregate across all
 * registered providers), so PROPFIND/PROPPATCH can depend on a single
 * registry instance without knowing how many providers back it.
 *
 * Unlike `AuthProviderRegistry` (M1), which resolves exactly one
 * provider per auth scheme, property providers are additive — a
 * resource's properties come from every registered provider at once
 * (core WebDAV properties now, M3's ACL properties and M5/M6's
 * CalDAV/CardDAV properties later), so registering doesn't replace an
 * existing entry the way `AuthProviderRegistry.register` does.
 */
export class PropertyProviderRegistry implements PropertyProvider {
  private readonly providers: PropertyProvider[] = [];

  /** Adds `provider` to the set consulted by `listLiveProperties`/`isLiveProperty`. */
  register(provider: PropertyProvider): void {
    this.providers.push(provider);
  }

  /** The union of every registered provider's live properties for `resource`. */
  listLiveProperties(resource: WebDavResource): PropertyValue[] {
    return this.providers.flatMap((provider) =>
      provider.listLiveProperties(resource),
    );
  }

  /** Whether any registered provider treats `namespace`/`name` as a live property. */
  isLiveProperty(namespace: string, name: string): boolean {
    return this.providers.some((provider) =>
      provider.isLiveProperty(namespace, name),
    );
  }
}
