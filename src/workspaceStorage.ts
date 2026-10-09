let activeOrganisationId: string | null = null

export function setWorkspaceScope(organisationId: string | null) {
  activeOrganisationId = organisationId
}

export function scopedStorageKey(key: string) {
  if (!activeOrganisationId) throw new Error('Workspace must be loaded before accessing local data.')
  return `cc-org-${activeOrganisationId}-${key}`
}
