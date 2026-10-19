import { toAddressbookUrl } from '../../carddav/addressbook-report-support.js';
import { toCalendarUrl } from '../../caldav/calendar-home-url.js';
import { DAV_NAMESPACE } from '../xml/request-parser.js';
import { AddressbookCollection } from '../../entities/addressbook-collection.entity.js';
import { CalendarCollection } from '../../entities/calendar-collection.entity.js';
import type {
  PropertyProvider,
  PropertyProviderContext,
  PropertyValue,
} from './property-provider.interface.js';

const ADD_MEMBER = 'add-member';

/**
 * `DAV:add-member` (RFC 5995 §3.2): the URL a client `POST`s a new member
 * to. For a calendar or addressbook collection that is the collection
 * itself — the `POST` handler (`add-member.route.ts`) stores the body
 * under a name it chooses. Generic over the tree's resource type, like
 * `GetctagProvider`; other resources do not carry it.
 */
export class AddMemberProvider<
  TResource,
> implements PropertyProvider<TResource> {
  /** See {@link PropertyProvider.listLiveProperties}. */
  // eslint-disable-next-line @typescript-eslint/require-await -- must match the async PropertyProvider interface; the value comes straight from the resource.
  async listLiveProperties(
    resource: TResource,
    context: PropertyProviderContext,
  ): Promise<PropertyValue[]> {
    let url: string;
    if (resource instanceof CalendarCollection) {
      url = toCalendarUrl(resource, context.tenant);
    } else if (resource instanceof AddressbookCollection) {
      url = toAddressbookUrl(resource, context.tenant);
    } else {
      return [];
    }
    return [
      {
        namespace: DAV_NAMESPACE,
        name: ADD_MEMBER,
        value: `<D:href xmlns:D="${DAV_NAMESPACE}">${url}</D:href>`,
      },
    ];
  }

  /** See {@link PropertyProvider.isLiveProperty}. */
  isLiveProperty(namespace: string, name: string): boolean {
    return namespace === DAV_NAMESPACE && name === ADD_MEMBER;
  }
}
