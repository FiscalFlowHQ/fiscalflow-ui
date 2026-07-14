import { useParams } from "react-router-dom";

/** Placeholder workspace — filled in by tasks 05–12. */
export default function RunPage() {
  const { threadId } = useParams<{ threadId: string }>();

  return (
    <div className="page-stub">
      <h1>Run workspace</h1>
      <p>
        Thread <code>{threadId}</code> — pipeline, chat, and artifacts land in later tasks.
      </p>
    </div>
  );
}
