// expect-error: React.memo wrapping a no-props component
const _UnnecessaryMemo = React.memo(() => {
  return <h1>Static</h1>;
});

// expect-error: bare memo wrapping an empty-destructure component
const _UnnecessaryMemoEmpty = memo(({}) => {
  return <h1>Static</h1>;
});

// expect-ok: memo with real primitive props
const _MemoizedReact = React.memo(({ title }) => {
  return <h1>{title}</h1>;
});

// expect-ok: no memo at all
const _NoPropsNoMemo = () => {
  return <h1>Static</h1>;
};
