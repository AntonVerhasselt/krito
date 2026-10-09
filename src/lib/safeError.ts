import { ConvexError } from "convex/values";
const messages: Record<string, string> = {
  unavailable: "Deze analyse is niet beschikbaar in deze browsersessie.",
  invalid_topic:
    "Dit onderwerp is niet beschikbaar. Kies opnieuw een onderwerp.",
  already_submitted:
    "Deze analyse is al gestart. Start een nieuwe analyse om materiaal te wijzigen.",
  invalid_email: "Vul een geldig e-mailadres in.",
  personal_email:
    "Gebruik je e-mailadres van school. Persoonlijke adressen zoals Gmail, Outlook of Telenet worden niet aanvaard.",
  files_not_ready:
    "Wacht tot alle bestanden gecontroleerd zijn en verwijder afgekeurde bestanden.",
  file_too_large: "Een bestand mag maximaal 10 MiB groot zijn.",
  total_too_large:
    "Upload maximaal 20 bestanden, samen maximaal 40 MiB.",
  invalid_pdf: "Dit bestand is onleesbaar of beschadigd.",
  unsupported_type:
    "Dit bestandstype wordt niet ondersteund. Gebruik pdf, Word, PowerPoint, Excel, CSV, tekst of een afbeelding (jpg of png).",
  conversion_failed:
    "Dit bestand kon niet worden geopend. Controleer of het niet beveiligd of beschadigd is en upload het opnieuw.",
  conversion_unavailable:
    "Het omzetten naar pdf lukt even niet. Verwijder het bestand en probeer het zo opnieuw.",
  converted_too_large:
    "Dit bestand wordt na het omzetten te groot. Verdeel het over meerdere bestanden.",
  encrypted_pdf:
    "Dit bestand is beveiligd met een wachtwoord. Upload een onbeveiligde versie.",
  file_size_mismatch:
    "Het bestand is niet volledig ontvangen. Verwijder het en upload opnieuw.",
  upload_validation_failed:
    "Het bestand kon niet gecontroleerd worden. Verwijder het en probeer opnieuw.",
  preparation_failed:
    "De documenten konden niet veilig worden voorbereid. Probeer opnieuw; upload opnieuw als dit blijft gebeuren.",
  creation_interrupted:
    "De verbinding werd onderbroken bij het starten. Er is niet automatisch opnieuw gestart. Je kunt zelf opnieuw proberen.",
  provider_timeout: "De analyse duurde te lang. Je kunt opnieuw proberen.",
  provider_credentials:
    "De analysedienst is niet beschikbaar. Probeer later opnieuw.",
  provider_configuration:
    "De analysedienst is niet beschikbaar. Probeer later opnieuw.",
  request_too_large:
    "Dit documentpakket of deze doelenlijst is te groot voor één analyse. Start een nieuwe analyse met minder materiaal of een ander onderwerp.",
  provider_request_rejected:
    "De analysedienst kon dit documentpakket niet verwerken. Controleer je bestanden en probeer opnieuw.",
  provider_refusal:
    "De analysedienst kon geen beoordeling geven voor dit materiaal.",
  invalid_output:
    "De beoordeling kon niet betrouwbaar worden opgeslagen. Probeer opnieuw.",
  provider_response_unavailable:
    "De opgeslagen beoordeling kon niet worden opgehaald. Probeer opnieuw.",
  provider_transient:
    "De analysedienst is tijdelijk niet beschikbaar. Probeer opnieuw.",
  session_storage_unavailable:
    "Sta sessieopslag toe in je browser om je privé-analyse te bewaren.",
};
export function safeError(error: unknown) {
  const code =
    typeof error === "string"
      ? error
      : error instanceof ConvexError && typeof error.data === "string"
        ? error.data
        : error instanceof Error &&
            error.message === "session_storage_unavailable"
          ? error.message
          : "";
  return (
    messages[code] ??
    "Dat lukte niet. Je selectie blijft bewaard; probeer opnieuw."
  );
}
