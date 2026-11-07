// Les traductions de BlockNote lui-même (ADR 0009 : branchées ici, jamais
// modifiées). Le français par défaut.
import * as dictionnaires from '@blocknote/core/locales'

export function dictionnaire(langue) {
  return dictionnaires[langue] || dictionnaires.fr
}
