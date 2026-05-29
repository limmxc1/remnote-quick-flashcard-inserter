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

      const focusedRem = await plugin.focus.getFocusedRem();
      if (focusedRem) {
        parentRemId = focusedRem._id;
      } else {
        const openRemId = await plugin.window.getOpenPaneRemId(undefined);
        if (openRemId) {
          parentRemId = openRemId;
        }
      }

      if (parentRemId) {
        const parentRem = await plugin.rem.findOne(parentRemId);
        const text = parentRem?.text;
        if (text) {
          const asString = (await plugin.richText.toString(text)).trim();
          if (asString) {
            parentName = asString;
          }
        }
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
