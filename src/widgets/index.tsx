import { declareIndexPlugin, type ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../index.css';

// The popup widget file name (matches src/widgets/flashcard_popup.tsx).
const POPUP_WIDGET = 'flashcard_popup';

async function onActivate(plugin: ReactRNPlugin) {
  // A setting so the user can pick the default practice direction for new cards.
  await plugin.settings.registerDropdownSetting({
    id: 'default-direction',
    title: 'Default flashcard direction',
    description:
      'Which way you want to be quizzed by default. You can still change it for each card in the popup.',
    defaultValue: 'forward',
    options: [
      { key: 'forward', value: 'forward', label: 'Question → Answer' },
      { key: 'backward', value: 'backward', label: 'Answer → Question' },
      { key: 'both', value: 'both', label: 'Both ways' },
    ],
  });

  // The command that opens the "add a flashcard" popup.
  await plugin.app.registerCommand({
    id: 'insert-flashcard',
    name: 'Insert Flashcard',
    description: 'Add a new flashcard (question + answer) to the document you are in.',
    quickCode: 'card',
    action: async () => {
      // Work out where the new card should live, captured BEFORE the popup
      // takes the cursor focus. We prefer the exact spot the cursor is in,
      // and fall back to the document open in the current pane.
      let parentRemId: string | undefined;
      let parentName = 'your notes';

      // Helper: turn a rem's text into a short readable name, or '' if empty.
      const nameOf = async (remId: string | undefined): Promise<string> => {
        if (!remId) return '';
        const rem = await plugin.rem.findOne(remId);
        if (!rem?.text) return '';
        return (await plugin.richText.toString(rem.text)).trim();
      };

      const focusedRem = await plugin.focus.getFocusedRem();
      const openRemId = await plugin.window.getOpenPaneRemId(undefined);

      if (focusedRem) {
        parentRemId = focusedRem._id;
      } else if (openRemId) {
        parentRemId = openRemId;
      }

      // Show the most meaningful label we can: the focused bullet's text, or
      // (if that bullet is empty) the name of the document it lives in.
      const focusedName = await nameOf(parentRemId);
      const docName = await nameOf(openRemId);
      if (focusedName) {
        parentName = focusedName;
      } else if (docName) {
        parentName = docName;
      }

      await plugin.widget.openPopup(POPUP_WIDGET, { parentRemId, parentName });
    },
  });

  // Register the popup widget that holds the add-a-flashcard form.
  await plugin.app.registerWidget(POPUP_WIDGET, WidgetLocation.Popup, {
    dimensions: { height: 'auto', width: 440 },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
