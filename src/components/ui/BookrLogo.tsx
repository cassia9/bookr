interface BookrLogoProps {
  size?: number
}

export default function BookrLogo({ size = 32 }: BookrLogoProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{
        fontFamily: 'Georgia, serif',
        fontSize: size * 0.82,
        fontWeight: 700,
        color: 'white',
        lineHeight: 1,
        letterSpacing: '-0.05em',
        userSelect: 'none',
      }}>B</span>
    </div>
  )
}
