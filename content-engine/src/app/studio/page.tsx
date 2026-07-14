import { SAMPLE_BOOKS } from "@/lib/sample-books";
import StudioClient from "./studio-client";

export const dynamic = "force-static";

// The "one book -> many outputs" screen. This is the app's whole point made
// visible: fill in a book once on the left, see every output type on the right.
export default function StudioPage() {
  return <StudioClient sampleBooks={SAMPLE_BOOKS} />;
}
