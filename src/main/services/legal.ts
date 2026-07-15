import { JsonStore } from '../store'
import { paths } from '../paths'
import { EULA_VERSION, PRIVACY_VERSION } from '@shared/legal'
import type { LegalStatus } from '@shared/types'

interface LegalFile {
  acceptedEulaVersion: string
  acceptedPrivacyVersion: string
  acceptedAt: string
}

let store: JsonStore<LegalFile> | null = null

function getStore(): JsonStore<LegalFile> {
  if (!store) {
    store = new JsonStore<LegalFile>(paths.file('legal.json'), {
      acceptedEulaVersion: '',
      acceptedPrivacyVersion: '',
      acceptedAt: ''
    })
  }
  return store
}

export const legalService = {
  status(): LegalStatus {
    const file = getStore().get()
    return {
      accepted:
        file.acceptedEulaVersion === EULA_VERSION &&
        file.acceptedPrivacyVersion === PRIVACY_VERSION,
      eulaVersion: EULA_VERSION,
      privacyVersion: PRIVACY_VERSION
    }
  },

  accept(): void {
    getStore().set({
      acceptedEulaVersion: EULA_VERSION,
      acceptedPrivacyVersion: PRIVACY_VERSION,
      acceptedAt: new Date().toISOString()
    })
  }
}
