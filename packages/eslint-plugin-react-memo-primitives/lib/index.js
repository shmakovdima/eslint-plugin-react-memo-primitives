"use strict";

const requireMemoPrimitives = require("./rules/require-memo-primitives");
const noUnnecessaryMemo = require("./rules/no-unnecessary-memo");

const rules = {
  "require-memo-primitives": requireMemoPrimitives,
  "no-unnecessary-memo": noUnnecessaryMemo,
};

const pluginName = "react-memo-primitives";

const plugin = {
  meta: {
    name: "eslint-plugin-react-memo-primitives",
  },
  rules,
  configs: {},
};

plugin.configs.recommended = {
  plugins: [pluginName],
  rules: {
    [`${pluginName}/require-memo-primitives`]: "error",
    [`${pluginName}/no-unnecessary-memo`]: "error",
  },
};

plugin.configs["flat/recommended"] = [
  {
    plugins: { [pluginName]: plugin },
    rules: {
      [`${pluginName}/require-memo-primitives`]: "error",
      [`${pluginName}/no-unnecessary-memo`]: "error",
    },
  },
];

module.exports = plugin;
