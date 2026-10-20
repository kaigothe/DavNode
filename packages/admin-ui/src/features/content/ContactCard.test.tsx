import { render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import type { Contact } from '../../api/client';
import { initI18n } from '../../i18n';
import { ContactCard } from './ContactCard';

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: '00000000-0000-4000-8000-000000000001',
  uid: 'ada1',
  name: 'ada.vcf',
  displayName: 'Ada Lovelace',
  organization: 'Analytical Engines',
  title: 'Programmer',
  emails: [{ value: 'ada@analytical.example', types: ['work'] }],
  phones: [{ value: '+49 170 1', types: ['cell'] }],
  addresses: ['1 Main St, London'],
  birthday: null,
  notes: null,
  hasPhoto: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

async function show(value: Contact) {
  const i18n = initI18n('en');
  await i18n.changeLanguage('en');
  render(
    <I18nextProvider i18n={i18n}>
      <ContactCard contact={value} />
    </I18nextProvider>,
  );
  return within(screen.getByRole('article', { name: 'Business card' }));
}

describe('ContactCard', () => {
  it('shows name, position, organisation and the contact lines', async () => {
    const card = await show(contact());

    expect(
      card.getByRole('heading', { name: 'Ada Lovelace' }),
    ).toBeInTheDocument();
    expect(card.getByText('Programmer')).toBeInTheDocument();
    expect(card.getByText('Analytical Engines')).toBeInTheDocument();
    expect(card.getByText('ada@analytical.example (work)')).toBeInTheDocument();
    expect(card.getByText('+49 170 1 (cell)')).toBeInTheDocument();
    expect(card.getByText('1 Main St, London')).toBeInTheDocument();
  });

  it('shows initials instead of a picture', async () => {
    const card = await show(contact());

    expect(card.getByText('AL')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('leaves out what the contact does not have', async () => {
    const card = await show(
      contact({ title: null, organization: null, phones: [], addresses: [] }),
    );

    expect(card.queryByText('Programmer')).not.toBeInTheDocument();
    expect(card.queryByText(/\+49/)).not.toBeInTheDocument();
    expect(card.queryByText('1 Main St, London')).not.toBeInTheDocument();
    expect(card.getByText('ada@analytical.example (work)')).toBeInTheDocument();
  });

  it('shows at most two addresses and two numbers; the list has the rest', async () => {
    const card = await show(
      contact({
        emails: ['a', 'b', 'c'].map((n) => ({
          value: `${n}@x.example`,
          types: [],
        })),
        phones: ['1', '2', '3'].map((n) => ({ value: `+49 ${n}`, types: [] })),
      }),
    );

    expect(card.getByText('b@x.example')).toBeInTheDocument();
    expect(card.queryByText('c@x.example')).not.toBeInTheDocument();
    expect(card.queryByText('+49 3')).not.toBeInTheDocument();
  });

  it('renders text as text, never as markup', async () => {
    const card = await show(contact({ organization: '<b>Bold</b> & Co' }));

    expect(card.getByText('<b>Bold</b> & Co')).toBeInTheDocument();
    expect(document.querySelector('article b')).toBeNull();
  });
});
