// expect-error: missing memo, primitive props, arrow
const _NotMemoized = ({ title, age }) => {
  return (
    <h1>
      {title}-{age}
    </h1>
  );
};

// expect-error: missing memo, primitive props, function declaration
function _NotMemoizedFn({ title }) {
  return <h1>{title}</h1>;
}

// expect-ok: already wrapped in React.memo
const _MemoizedReact = React.memo(({ title, age }) => {
  return (
    <h1>
      {title}-{age}
    </h1>
  );
});

// expect-ok: already wrapped in bare memo
const _MemoizedBare = memo(({ title, age }) => {
  return (
    <h1>
      {title}-{age}
    </h1>
  );
});

// expect-ok: no props at all, no memo needed
const _NoPropsNoMemo = () => {
  return <h1>Static</h1>;
};

// expect-ok: not a component, no JSX
const _util = ({ a, b }) => a + b;

type _AllPrimitiveProps = { title: string; age: number | undefined };
// expect-error: missing memo, all typed props are primitive (string, number | undefined)
const _NotMemoizedTyped = ({ title, age }: _AllPrimitiveProps) => {
  return (
    <h1>
      {title}-{age}
    </h1>
  );
};

// expect-ok: regression — emailInputRef (MutableRefObject) and handleAcceptClick (function) are
// not primitives, so this must NOT be flagged even though it also has plain string/boolean props.
type _ReferralHeroInputProps = {
  code: string | undefined;
  emailInputRef: MutableRefObject<HTMLInputElement | null>;
  handleAcceptClick: () => void;
  isCustomCode: boolean;
};
const _ReferralHeroInput = ({
  code,
  emailInputRef,
  handleAcceptClick,
  isCustomCode,
}: _ReferralHeroInputProps) => {
  return (
    <input ref={emailInputRef} onClick={handleAcceptClick}>
      {code}-{isCustomCode}
    </input>
  );
};

// expect-error: wrapped in memo but has non-primitive (ref/function) props, now disallowed
const _ReferralHeroInputMemoized = memo(
  ({
    code,
    emailInputRef,
    handleAcceptClick,
    isCustomCode,
  }: _ReferralHeroInputProps) => {
    return (
      <input ref={emailInputRef} onClick={handleAcceptClick}>
        {code}-{isCustomCode}
      </input>
    );
  },
);
