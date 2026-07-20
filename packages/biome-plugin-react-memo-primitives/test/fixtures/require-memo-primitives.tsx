// expect-error: missing memo, primitive props, arrow
const NotMemoized = ({ title, age }) => {
  return (
    <h1>
      {title}-{age}
    </h1>
  );
};

// expect-error: missing memo, primitive props, function declaration
function NotMemoizedFn({ title }) {
  return <h1>{title}</h1>;
}

// expect-ok: already wrapped in React.memo
const MemoizedReact = React.memo(({ title, age }) => {
  return (
    <h1>
      {title}-{age}
    </h1>
  );
});

// expect-ok: already wrapped in bare memo
const MemoizedBare = memo(({ title, age }) => {
  return (
    <h1>
      {title}-{age}
    </h1>
  );
});

// expect-ok: no props at all, no memo needed
const NoPropsNoMemo = () => {
  return <h1>Static</h1>;
};

// expect-ok: not a component, no JSX
const util = ({ a, b }) => a + b;
