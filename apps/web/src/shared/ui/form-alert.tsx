export function FormAlert({ message }: { message: string | undefined }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      {message}
    </p>
  );
}
