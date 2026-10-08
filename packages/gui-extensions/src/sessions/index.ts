import { Schema } from "effect"
import { Extension, Store } from "../sdk"
import en from "./i18n/en"

const Prefs = Schema.Struct({
  groupBy: Schema.Literals(["state", "project"]),
  status: Schema.Literals(["active", "archived"]),
  projects: Schema.Array(Schema.String),
  days: Schema.Number,
  sort: Schema.Literals(["updated", "created"]),
})

export default Extension.define({
  id: "sessions",
  stores: {
    prefs: Store.global(Prefs, { groupBy: "state", status: "active", projects: [], days: 7, sort: "updated" }),
  },
  i18n: { en },
})
