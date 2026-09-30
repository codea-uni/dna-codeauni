import { Building2, KeyRound, LogOut, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconButton } from '../components/IconButton';
import { MenuButton } from '../components/MenuButton';
import { useT } from '../i18n';
import { useAuth } from '../server/api';
import { ChangePasswordForm } from './ChangePasswordForm';

/** Menú de la cuenta en la barra de herramientas (solo en modo servidor). */
export function UserMenu() {
  const t = useT();
  const user = useAuth((s) => s.user);
  const signOut = useAuth((s) => s.signOut);
  const clearError = useAuth((s) => s.clearError);
  const [changing, setChanging] = useState(false);
  if (!user) return null;
  const close = () => {
    clearError();
    setChanging(false);
  };

  return (
    <>
      <MenuButton
        icon={UserRound}
        label={t('auth.account', { name: user.name })}
        items={[
          {
            icon: KeyRound,
            label: t('auth.changePassword'),
            hint: user.email,
            onSelect: () => {
              setChanging(true);
            },
          },
          { icon: LogOut, label: t('auth.signOut'), onSelect: () => void signOut() },
        ]}
      />
      {changing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={close}>
          <div
            className="modal auth-modal"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <header>
              <h2>{t('auth.changePassword')}</h2>
              <button className="icon" onClick={close} aria-label={t('settings.close')}>
                <X size={16} />
              </button>
            </header>
            <ChangePasswordForm onDone={close} />
          </div>
        </div>
      )}
    </>
  );
}

/** Vuelve del editor a las minas de la empresa (solo en modo servidor, dentro del router). */
export function BackToMines() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <IconButton
      icon={Building2}
      label={t('workspace.backToMines')}
      onClick={() => {
        void navigate('/');
      }}
    />
  );
}
