/** Why a submitted file was left out of an analysis, as a phrase after its name. */
export function skipReason(code: string | null | undefined) {
  switch (code) {
    case "encrypted_pdf":
      return "is beveiligd met een wachtwoord";
    case "converted_too_large":
      return "werd te groot na het omzetten naar pdf";
    case "converted_total_too_large":
      return "paste niet meer binnen 40 MiB na het omzetten naar pdf";
    case "file_changed":
      return "was niet meer beschikbaar";
    default:
      return "kon niet geopend worden (beveiligd of beschadigd?)";
  }
}
