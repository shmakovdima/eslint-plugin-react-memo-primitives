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

type AllPrimitiveTyped = { title: string; age: number | undefined };
// expect-error: missing memo, all typed props are primitive
const NotMemoizedTyped = ({ title, age }: AllPrimitiveTyped) => {
  return (
    <h1>
      {title}-{age}
    </h1>
  );
};

// expect-ok: regression — emailInputRef (MutableRefObject) and handleAcceptClick (function) are
// not primitives, so this must NOT be flagged even though it also has plain string/boolean props.
type ReferralHeroInputProps = {
  code: string | undefined;
  emailInputRef: MutableRefObject<HTMLInputElement | null>;
  handleAcceptClick: () => void;
  isCustomCode: boolean;
};
const ReferralHeroInput = ({
  code,
  emailInputRef,
  handleAcceptClick,
  isCustomCode,
}: ReferralHeroInputProps) => {
  return (
    <input ref={emailInputRef} onClick={handleAcceptClick}>
      {code}-{isCustomCode}
    </input>
  );
};

// expect-ok: nested object-shaped member (config) is not primitive
type HasNestedObjectProps = { title: string; config: { theme: string } };
const HasNestedObject = ({ title, config }: HasNestedObjectProps) => {
  return (
    <h1>
      {title}-{config.theme}
    </h1>
  );
};

// expect-error: all-primitive props via inline object type literal, no local alias
const InlineAllPrimitive = ({
  title,
  isActive,
}: {
  title: string;
  isActive: boolean;
}) => {
  return (
    <h1>
      {title}-{isActive}
    </h1>
  );
};

// expect-ok: inline object type literal with a function member
const InlineHasFn = ({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) => {
  return <h1 onClick={onClick}>{title}</h1>;
};

// expect-error: wrapped in memo but has non-primitive props (ref, function) — now disallowed
const ReferralHeroInputMemoized = memo(
  ({
    code,
    emailInputRef,
    handleAcceptClick,
    isCustomCode,
  }: ReferralHeroInputProps) => {
    return (
      <input ref={emailInputRef} onClick={handleAcceptClick}>
        {code}-{isCustomCode}
      </input>
    );
  },
);

// expect-error: wrapped in React.memo but has a nested object-shaped member
const HasNestedObjectMemoized = React.memo(
  ({ title, config }: HasNestedObjectProps) => {
    return (
      <h1>
        {title}-{config.theme}
      </h1>
    );
  },
);

// expect-ok: wrapped in memo, all typed props are primitive
type AllPrimitiveMemoOk = { title: string; count: number };
const AllPrimitiveMemoized = memo(({ title, count }: AllPrimitiveMemoOk) => {
  return (
    <h1>
      {title}-{count}
    </h1>
  );
});
