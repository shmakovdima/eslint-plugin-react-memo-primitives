// expect-error: React.memo wrapping a no-props component
const UnnecessaryMemo = React.memo(() => {
  return <h1>Static</h1>;
});

// expect-error: bare memo wrapping an empty-destructure component
const UnnecessaryMemoEmpty = memo(({}) => {
  return <h1>Static</h1>;
});

// expect-ok: memo with real primitive props
const MemoizedReact = React.memo(({ title }) => {
  return <h1>{title}</h1>;
});

// expect-ok: no memo at all
const NoPropsNoMemo = () => {
  return <h1>Static</h1>;
};
