import { memo } from "some-other-lib";

// expect-error: `memo` shadowed by a non-react import, so this isn't real memoization
const FakeMemoized = memo(({ title }) => {
  return <h1>{title}</h1>;
});
