import React from 'react';

// Узнаваемые знаки провайдеров в карточках и на странице подключения:
// фирменный цвет и буква, без копирования логотипов.
const MARKS = {
  TINKOFF: { bg: '#ffdd2d', fg: '#111', letter: 'Т' },
  YOOKASSA: { bg: '#0a2896', fg: '#fff', letter: 'Ю' },
};

const ProviderLogo = ({ code, size = 48 }) => {
  const mark = MARKS[code];
  if (!mark) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="12" fill={mark.bg} />
      <text
        x="24"
        y="32.5"
        textAnchor="middle"
        fontSize="24"
        fontWeight="800"
        fontFamily="inherit"
        fill={mark.fg}
      >
        {mark.letter}
      </text>
    </svg>
  );
};

export default ProviderLogo;
