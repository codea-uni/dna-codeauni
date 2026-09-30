/**
 * Consola de la plataforma: el superadministrador ve todas las empresas, las crea y desactiva
 * empresas o cuentas (D-14). `satisfies` exige las mismas claves en ambos idiomas.
 */
export const es = {
  'platform.title': 'Plataforma',
  'platform.intro':
    'Todas las empresas que usan Cronos. Desactivar una empresa o una cuenta corta el acceso sin borrar datos ni historial.',
  'platform.companies': 'Empresas',
  'platform.activeCount': '{n} activas',
  'platform.disabledCount': '{n} desactivadas',
  'platform.empty': 'Todavía no hay empresas. Crea la primera abajo.',
  'platform.company': 'Empresa',
  'platform.people': 'Personas',
  'platform.mines': 'Minas',
  'platform.projects': 'Proyectos',
  'platform.versions': 'Versiones',
  'platform.lastActivity': 'Última versión',
  'platform.never': 'Sin versiones',
  'platform.admins': 'Administradores',
  'platform.status.active': 'Activa',
  'platform.status.disabled': 'Desactivada',
  'platform.showUsers': 'Ver personas',
  'platform.hideUsers': 'Ocultar personas',
  'platform.disable': 'Desactivar',
  'platform.enable': 'Reactivar',
  'platform.disableConfirm':
    '¿Desactivar {name}? Nadie de la empresa podrá abrir sus minas ni proyectos hasta que la reactives. No se borra nada.',
  'platform.enableConfirm': '¿Reactivar {name}?',
  'platform.userDisableConfirm':
    '¿Desactivar la cuenta de {name}? Se cierran sus sesiones y no podrá entrar. Su nombre sigue en el historial.',
  'platform.lastSeen': 'Último acceso',
  'platform.account': 'Cuenta',
  'platform.accountActive': 'Activa',
  'platform.accountDisabled': 'Desactivada',
  'platform.newCompany': 'Nueva empresa',
  'platform.newCompanyHint':
    'Se crea con su primer administrador, que recibe una contraseña temporal y la cambia al entrar. Él da de alta al resto de su equipo.',
  'platform.companyName': 'Nombre de la empresa',
  'platform.adminName': 'Nombre del administrador',
  'platform.adminEmail': 'Correo del administrador',
  'platform.adminPassword': 'Contraseña temporal',
  'platform.create': 'Crear empresa',
  'platform.created': 'Empresa «{name}» creada',
  'platform.error.cannotDisableSelf': 'No puedes desactivar tu propia cuenta.',
  'platform.noAdmin': 'Sin administrador: asígnale uno para que pueda usarse.',
  'platform.addAdmin': 'Asignar administrador',
  'platform.addAdminHint':
    'Una cuenta nueva (con contraseña temporal) o una existente que no pertenezca a otra empresa.',
  'platform.assign': 'Asignar',
};

export const en = {
  'platform.title': 'Platform',
  'platform.intro':
    'Every company using Cronos. Disabling a company or an account cuts access without deleting data or history.',
  'platform.companies': 'Companies',
  'platform.activeCount': '{n} active',
  'platform.disabledCount': '{n} disabled',
  'platform.empty': 'No companies yet. Create the first one below.',
  'platform.company': 'Company',
  'platform.people': 'People',
  'platform.mines': 'Mines',
  'platform.projects': 'Projects',
  'platform.versions': 'Versions',
  'platform.lastActivity': 'Latest version',
  'platform.never': 'No versions',
  'platform.admins': 'Administrators',
  'platform.status.active': 'Active',
  'platform.status.disabled': 'Disabled',
  'platform.showUsers': 'Show people',
  'platform.hideUsers': 'Hide people',
  'platform.disable': 'Disable',
  'platform.enable': 'Re-enable',
  'platform.disableConfirm':
    'Disable {name}? Nobody in the company will be able to open its mines or projects until you re-enable it. Nothing is deleted.',
  'platform.enableConfirm': 'Re-enable {name}?',
  'platform.userDisableConfirm':
    'Disable {name}’s account? Their sessions are closed and they cannot sign in. Their name stays in the history.',
  'platform.lastSeen': 'Last seen',
  'platform.account': 'Account',
  'platform.accountActive': 'Active',
  'platform.accountDisabled': 'Disabled',
  'platform.newCompany': 'New company',
  'platform.newCompanyHint':
    'It is created with its first administrator, who gets a temporary password to change on first sign-in and then adds the rest of the team.',
  'platform.companyName': 'Company name',
  'platform.adminName': 'Administrator name',
  'platform.adminEmail': 'Administrator email',
  'platform.adminPassword': 'Temporary password',
  'platform.create': 'Create company',
  'platform.created': 'Company “{name}” created',
  'platform.error.cannotDisableSelf': 'You cannot disable your own account.',
  'platform.noAdmin': 'No administrator: assign one so the company can be used.',
  'platform.addAdmin': 'Assign administrator',
  'platform.addAdminHint':
    'A new account (with a temporary password) or an existing one that does not belong to another company.',
  'platform.assign': 'Assign',
} satisfies Record<keyof typeof es, string>;
