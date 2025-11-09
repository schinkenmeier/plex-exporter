import type { AdminViewModule } from '../index.ts';
import { adminApiClient } from '../../core/api.ts';
import { createCard } from '../../components/card.ts';

export const diagnosticsView: AdminViewModule = {
  id: 'diagnostics',
  label: 'Diagnose',
  title: 'Diagnose-Tools',
  description: 'Tautulli-, Datenbank- und Resend-Verbindungen testen.',
  mount: ({ container, toast }) => {
    const grid = document.createElement('div');
    grid.className = 'diagnostics-grid';

    const tautulliCard = createCard({ title: 'Tautulli-Test', description: 'API-Verbindung prüfen.' });
    const tautulliButton = createButton('Test ausführen');
    const tautulliStatus = document.createElement('p');
    tautulliStatus.className = 'admin-muted-text';
    tautulliStatus.textContent = 'Noch kein Test.';
    tautulliCard.body.append(tautulliButton, tautulliStatus);

    const dbCard = createCard({ title: 'Datenbank-Test', description: 'SQLite-Zugriff prüfen.' });
    const dbButton = createButton('Test ausführen');
    const dbStatus = document.createElement('p');
    dbStatus.className = 'admin-muted-text';
    dbStatus.textContent = 'Noch kein Test.';
    dbCard.body.append(dbButton, dbStatus);

    const resendCard = createCard({ title: 'Resend-Test', description: 'Testmail senden.' });
    const resendInput = document.createElement('input');
    resendInput.className = 'admin-input';
    resendInput.placeholder = 'test@example.com';
    resendInput.type = 'email';
    const resendButton = createButton('Testmail senden');
    const resendStatus = document.createElement('p');
    resendStatus.className = 'admin-muted-text';
    resendStatus.textContent = 'Noch kein Test.';
    resendCard.body.append(resendInput, resendButton, resendStatus);

    grid.append(tautulliCard, dbCard, resendCard);
    container.appendChild(grid);

    tautulliButton.addEventListener('click', async () => {
      tautulliButton.disabled = true;
      tautulliStatus.textContent = 'Starte Test...';
      try {
        const result = await adminApiClient.testTautulli();
        tautulliStatus.textContent = result.message ?? 'Tautulli-Test erfolgreich.';
        toast.show('Tautulli erreichbar', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Test fehlgeschlagen';
        tautulliStatus.textContent = message;
        toast.show(message, 'error');
      } finally {
        tautulliButton.disabled = false;
      }
    });

    dbButton.addEventListener('click', async () => {
      dbButton.disabled = true;
      dbStatus.textContent = 'Starte Test...';
      try {
        const result = await adminApiClient.testDatabase();
        dbStatus.textContent = result.message ?? 'Datenbank-Test erfolgreich.';
        toast.show('Datenbank erreichbar', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Test fehlgeschlagen';
        dbStatus.textContent = message;
        toast.show(message, 'error');
      } finally {
        dbButton.disabled = false;
      }
    });

    resendButton.addEventListener('click', async () => {
      const recipient = resendInput.value.trim();
      if (!recipient) {
        toast.show('Bitte Empfängeradresse eingeben', 'error');
        return;
      }
      resendButton.disabled = true;
      resendStatus.textContent = 'Sende Testmail...';
      try {
        await adminApiClient.testResend(recipient);
        resendStatus.textContent = 'Testmail gesendet.';
        toast.show('Testmail gesendet', 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Test fehlgeschlagen';
        resendStatus.textContent = message;
        toast.show(message, 'error');
      } finally {
        resendButton.disabled = false;
      }
    });

    return () => {};
  },
};

function createButton(text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'admin-btn';
  button.textContent = text;
  return button;
}
