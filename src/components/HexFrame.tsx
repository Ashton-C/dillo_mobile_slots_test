import { View, ViewStyle } from 'react-native';

const SQRT3 = Math.sqrt(3);

interface Props {
  size: number;          // full edge-to-edge horizontal width of the hex
  color: string;         // outline color
  thickness?: number;    // outline thickness in px
  fillColor?: string;    // optional interior fill (rendered as 3 overlapping rotated rects)
  fillOpacity?: number;  // alpha applied to fillColor when not already an rgba string
  style?: ViewStyle;
}

// Pointy-top regular hexagon outline composed from 3 thin rotated rectangles.
// Each rectangle has full width = `size` and height = size * sqrt(3) and only
// renders its TOP and BOTTOM borders (sides transparent). Rotating those
// rectangles by 0°, 60°, 120° around the shared center exactly traces the 6
// edges of a regular hexagon (each rectangle contributes the two parallel
// edges separated by 60° from the next pair). No SVG dep needed.
//
// Width = size; Height = size * sqrt(3) / 2 (≈ 0.866 * size).
export function HexFrame({ size, color, thickness = 2, fillColor, style }: Props) {
  const rectW = size / 2;
  const rectH = (size / 2) * SQRT3;
  const containerH = (size * SQRT3) / 2;

  return (
    <View
      style={[
        { width: size, height: containerH, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
      pointerEvents="none"
    >
      {fillColor
        ? [0, 60, 120].map((deg) => (
            <View
              key={`f${deg}`}
              style={{
                position: 'absolute',
                width: rectW,
                height: rectH,
                backgroundColor: fillColor,
                transform: [{ rotate: `${deg}deg` }],
              }}
            />
          ))
        : null}
      {[0, 60, 120].map((deg) => (
        <View
          key={`b${deg}`}
          style={{
            position: 'absolute',
            width: rectW,
            height: rectH,
            borderTopWidth: thickness,
            borderBottomWidth: thickness,
            borderColor: color,
            transform: [{ rotate: `${deg}deg` }],
          }}
        />
      ))}
    </View>
  );
}
