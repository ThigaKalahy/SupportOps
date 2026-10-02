"use client"

import { FieldGroup } from "@/components/ui/field-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * FieldGroup com filho função (render prop). Precisa ser componente de
 * cliente: um Server Component não pode passar função como filho.
 */
export function LabFieldRender({ label, help, options }: { label: string; help: string; options: readonly string[] }) {
  return (
    <FieldGroup label={label} help={help} className="w-full">
      {(control) => (
        <Select defaultValue={options[1]}>
          <SelectTrigger {...control} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FieldGroup>
  )
}
