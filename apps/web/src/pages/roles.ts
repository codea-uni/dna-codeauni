import type { Role } from '@cronos/api';
import type { MessageKey } from '../i18n';

/** Nombre del rol en la interfaz. */
export const roleKey = (role: Role): MessageKey => `role.${role}`;

/** Qué puede hacer el rol (guía 01 §1.4). */
export const roleHintKey = (role: Role): MessageKey => `role.hint.${role}`;
