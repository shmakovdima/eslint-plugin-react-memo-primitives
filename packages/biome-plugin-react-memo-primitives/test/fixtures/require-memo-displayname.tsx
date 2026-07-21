// expect-error: memo-wrapped, no displayName assignment
const NotNamed = React.memo(({ title }) => {
  return <h1>{title}</h1>;
});

// expect-ok: memo-wrapped with a matching displayName assignment
const Named = memo(({ title }) => {
  return <h1>{title}</h1>;
});
Named.displayName = "Named";

// expect-ok: not memoized at all, out of scope for this rule
const NotMemoized = ({ title }) => {
  return <h1>{title}</h1>;
};

// expect-error: displayName assignment is for a different identifier, doesn't count
const Mismatched = memo(({ title }) => {
  return <h1>{title}</h1>;
});
SomeoneElse.displayName = "SomeoneElse";
