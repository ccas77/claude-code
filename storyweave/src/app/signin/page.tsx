import { signIn } from '@/auth';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-xl font-bold">Sign in to StoryWeave</h1>
      <p className="mt-2 text-sm text-stone-500">
        Access is limited to allowlisted Google accounts.
      </p>
      <form
        className="mt-6"
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: callbackUrl ?? '/' });
        }}
      >
        <button
          type="submit"
          className="w-full rounded-lg bg-stone-900 px-4 py-2.5 font-semibold text-white hover:bg-stone-700"
        >
          Continue with Google
        </button>
      </form>
    </div>
  );
}
