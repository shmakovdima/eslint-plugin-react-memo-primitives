// expect-error: memo-wrapped, no displayName assignment
const _NotNamed = React.memo(({ title }) => {
  return <h1>{title}</h1>;
});

// expect-ok: memo-wrapped with a matching displayName assignment
const _Named = memo(({ title }) => {
  return <h1>{title}</h1>;
});
_Named.displayName = "_Named";

// expect-ok: not memoized at all, out of scope for this rule
const _NotMemoized = ({ title }) => {
  return <h1>{title}</h1>;
};

// expect-ok: not a component, no JSX
const _util = memo(() => 1);

// expect-error: displayName assignment is for a different identifier, doesn't count
const _Mismatched = memo(({ title }) => {
  return <h1>{title}</h1>;
});
_SomeoneElse.displayName = "_SomeoneElse";
