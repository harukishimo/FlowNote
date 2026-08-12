import { NotesWorkspace } from '@/components/notes/NotesWorkspace';
import { getCurrentSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getCurrentSession();
  if (!session?.user?.id) redirect('/login');
  return <NotesWorkspace />;
}
