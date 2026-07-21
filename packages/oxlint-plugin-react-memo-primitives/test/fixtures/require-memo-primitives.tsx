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

// expect-ok: array member and JSX.Element union member are both non-primitive
type _NumberSpeakProps = {
  title: JSX.Element | string;
  locale: _LocaleType;
  historicalPerformance: _HistoricalPerformance[];
  hideCTA?: boolean;
};
const _NumberSpeak = ({
  hideCTA,
  historicalPerformance,
  locale,
  title,
}: _NumberSpeakProps) => {
  return <div>{title}</div>;
};

type _CompareRatesProps = { locale: _LocaleType; variant?: "mica" | "trade" };
// expect-error: locale (bare unresolved reference, no type args) trusted as primitive
const _CompareRates = ({ locale, variant = "trade" }: _CompareRatesProps) => {
  return (
    <div>
      {locale}-{variant}
    </div>
  );
};

enum _Status {
  Active,
  Inactive,
}
type _StatusProps = { status: _Status };
// expect-error: local enum resolved by name is always primitive
const _StatusLabel = ({ status }: _StatusProps) => {
  return <div>{status}</div>;
};

type _ID = string | number;
type _IdProps = { id: _ID };
// expect-error: local type alias resolving to a primitive is unwrapped
const _IdLabel = ({ id }: _IdProps) => {
  return <div>{id}</div>;
};

type _Config = { theme: string };
type _ConfigProps = { title: string; config: _Config };
// expect-ok: local object type alias member is not primitive
const _ConfigLabel = ({ title, config }: _ConfigProps) => {
  return (
    <div>
      {title}-{config.theme}
    </div>
  );
};

type _PairProps = { pair: [string, number] };
// expect-ok: tuple types are never primitive
const _PairLabel = ({ pair }: _PairProps) => {
  return <div>{pair[0]}</div>;
};

type _DefaultValueProps = { title: string; count?: number };
// expect-error: default value on a primitive-typed prop doesn't change the verdict
const _DefaultValueLabel = ({ title, count = 0 }: _DefaultValueProps) => {
  return (
    <div>
      {title}-{count}
    </div>
  );
};

// expect-ok: regression — children from PropsWithChildren<T> is ReactNode, never primitive
const _WithChildren = ({
  title,
  children,
}: PropsWithChildren<{ title: string }>) => {
  return (
    <div>
      {title}
      {children}
    </div>
  );
};

// expect-error: PropsWithChildren's T members alone are all-primitive when children isn't destructured
const _WithChildrenUnused = ({
  title,
}: PropsWithChildren<{ title: string }>) => {
  return <div>{title}</div>;
};
