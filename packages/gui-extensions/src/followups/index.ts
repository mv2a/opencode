import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import en from "./i18n/en"

const Prefs = Schema.Struct({
  enabled: Schema.Boolean,
  // The model variant asked for when generating suggestions, so they skip slow reasoning; "" keeps the model's own.
  variant: Schema.String,
})

export default Extension.define({
  id: "followups",
  stores: {
    prefs: Store.global(Prefs, { enabled: true, variant: "fast" }),
  },
  i18n: { en },
})
