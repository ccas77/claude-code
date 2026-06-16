import { signIn } from '@/auth';

export const dynamic = 'force-dynamic';

export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  return <SignInForm searchParams={searchParams} />;
}

async function SignInForm({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const rejected = params.error === 'AccessDenied';

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-8 shadow-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookshelf</h1>
          <p className="mt-1 text-sm text-stone-600">
            Sign in with Google to continue.
          </p>
        </div>

        {rejected && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            That email isn&apos;t on the invite list. Ask Cordelia to add you.
          </div>
        )}

        <form
          action={async () => {
            'use server';
            await signIn('google', {
              redirectTo: params.callbackUrl ?? '/library',
            });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}
