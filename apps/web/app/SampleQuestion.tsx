'use client';

declare global {
  interface Window {
    LeadFlow?: { ask?: (text: string) => void };
  }
}

/** A sample question that opens the chat widget and asks it. */
export function SampleQuestion({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="kb-question"
      onClick={() => window.LeadFlow?.ask?.(text)}
      title="Ask this in the chat"
    >
      {text}
    </button>
  );
}
