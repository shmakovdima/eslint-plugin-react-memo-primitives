import { memo } from "react";
import React from "react";

// expect-ok: genuinely memoized via real `memo` import from react
const RealMemoized = memo(({ title }) => {
  return <h1>{title}</h1>;
});

// expect-ok: genuinely memoized via real `React.memo`
const RealMemoizedReact = React.memo(({ title }) => {
  return <h1>{title}</h1>;
});

// expect-error: real react import present, but this one isn't memoized at all
const NotMemoized = ({ title }) => {
  return <h1>{title}</h1>;
};
