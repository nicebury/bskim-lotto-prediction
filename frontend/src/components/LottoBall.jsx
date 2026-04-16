function rangeClass(n) {
  if (n <= 10) return 'range-1';
  if (n <= 20) return 'range-2';
  if (n <= 30) return 'range-3';
  if (n <= 40) return 'range-4';
  return 'range-5';
}

export default function LottoBall({ number, bonus = false }) {
  return (
    <span
      className={`lotto-ball ${rangeClass(number)}${bonus ? ' bonus' : ''}`}
      aria-label={bonus ? `보너스 번호 ${number}` : `당첨번호 ${number}`}
      title={bonus ? '보너스' : `${number}`}
    >
      {number}
    </span>
  );
}
