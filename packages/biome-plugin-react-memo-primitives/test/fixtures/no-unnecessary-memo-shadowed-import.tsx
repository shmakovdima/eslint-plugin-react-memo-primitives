import { memo } from "some-other-lib";

// expect-ok: `memo` shadowed by a non-react import, so this isn't real memoization (not flagged)
const FakeMemoized = memo(() => {
  return <h1>Static</h1>;
});
