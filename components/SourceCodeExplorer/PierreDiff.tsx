// Owned by the self-hosted fork (selfhost/README.md): the source diff view is
// not part of this build. Only upstream's contract-diff tool, which is removed,
// ever passes diff data to SourceCodeExplorer, so this never renders. Stubbing
// it here drops @pierre/diffs and its syntax-highlighting stack (about 50
// packages) without touching SourceCodeExplorer.tsx.
export default function PierreDiff(_props: {
  onNavigate?: (line: number) => void;
  [prop: string]: unknown;
}) {
  return null;
}
