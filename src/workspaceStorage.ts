let activeOrganisationId: string | null = null
let activeUserId: string | null = null

export function setWorkspaceIdentity(userId: string | null) {
  if (userId !== activeUserId) activeOrganisationId = null
  activeUserId = userId
}

export function privateStorageKey(key: string) {
  if (!activeUserId) throw new Error('Sign in before accessing private local data.')
  return `${scopedStorageKey(key)}-user-${activeUserId}`
}

export function setWorkspaceScope(organisationId: string | null) {
  activeOrganisationId = organisationId
}

export function scopedStorageKey(key: string) {
  if (!activeOrganisationId) throw new Error('Workspace must be loaded before accessing local data.')
  return `cc-org-${activeOrganisationId}-${key}`
}
