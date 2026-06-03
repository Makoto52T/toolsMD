import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import WikiGraphClient from './WikiGraphClient';
import { WIKI_GRAPH_OWNER_ID } from './owner';

// The Knowledge Graph is private to the project owner. Gate at the Server
// Component boundary so unauthorized users never receive the client bundle or
// trigger the (also-gated) /api/wiki/graph fetch.
export default async function WikiGraphPage() {
  const cookieStore = await cookies();
  const userId = cookieStore.get('userId')?.value;

  if (!userId) redirect('/login');
  if (userId !== WIKI_GRAPH_OWNER_ID) redirect('/dashboard');

  return <WikiGraphClient />;
}
