import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-black text-neutral-100 px-6 py-12">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-3xl md:text-4xl font-semibold">Welcome to Odysseus.ai</h1>
        <p className="text-neutral-400">
          Explore the autonomous software architect console to run build, design,
          refactor, and analysis tasks directly against your repository.
        </p>
        <Link
          href="/odysseus"
          className="inline-flex items-center justify-center rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-sm font-medium transition-colors"
        >
          Open Odysseus Console
        </Link>
      </div>
    </main>
  );
}
