import { Switch } from "@opencode/ui/switch"
import { useExtension } from "../sdk"
import type Followups from "./index"

/** The follow-up suggestions row of the host's General settings section, in the host's settings row markup. */
export default function EnabledRow() {
  const ctx = useExtension<typeof Followups>()
  const prefs = ctx.stores.prefs

  return (
    <div data-component="settings-row">
      <div data-slot="settings-row-copy">
        <div data-slot="settings-row-title">{ctx.t("settings.enabled.title")}</div>
        <div data-slot="settings-row-description">{ctx.t("settings.enabled.description")}</div>
      </div>
      <div data-slot="settings-row-control">
        <div data-action="settings-followups-enabled">
          <Switch
            aria-label={ctx.t("settings.enabled.title")}
            checked={prefs.value.enabled}
            onChange={(checked) =>
              prefs.update((draft) => {
                draft.enabled = checked
              })
            }
            hideLabel
          >
            {ctx.t("settings.enabled.title")}
          </Switch>
        </div>
      </div>
    </div>
  )
}
