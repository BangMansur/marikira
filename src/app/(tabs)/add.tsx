import { Redirect } from 'expo-router';

/** The centre (+) tab never shows its own page; its button opens the add-transaction sheet. */
export default function AddTab() {
  return <Redirect href="/add-transaction" />;
}
