const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤩', '😜',
  '🤔', '😴', '😭', '😡', '🥳', '😱', '🤯', '🙃', '😇', '🤗',
  '👍', '👎', '👏', '🙌', '🤘', '✌️', '👀', '🔥', '💯', '✨',
  '🎵', '🎶', '🎧', '🎤', '🎹', '🥁', '🎸', '🎷', '🪩', '🌟',
  '❤️', '💜', '💙', '💚', '🧡', '💔', '💫', '🌈', '☀️', '🌙',
  '🍕', '🍔', '🍟', '🍩', '🍪', '☕', '🍓', '🍉', '🍭', '🥑',
  '🐶', '🐱', '🦊', '🐼', '🦁', '🐯', '🐸', '🐵', '🦄', '🐙',
  '🚀', '🎮', '🏆', '🎯', '💡', '📯', '🎁', '🎉', '🎈', '🏁',
];

type Props = {
  onPick: (emoji: string) => void;
};

export default function EmojiPicker({ onPick }: Props) {
  return (
    <div className="border-t border-theme-border p-3 max-h-[200px] overflow-y-auto">
      <div className="grid grid-cols-8 sm:grid-cols-10 gap-1">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            className="aspect-square rounded-lg flex items-center justify-center text-xl hover:bg-theme-surface2 transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
