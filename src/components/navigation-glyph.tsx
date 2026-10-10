import { SvgXml } from "react-native-svg";
const paths = {
  home: '<path d="M3.8 10 12 3l8.2 7v9a2 2 0 0 1-2 2H15v-6.5H9V21H5.8a2 2 0 0 1-2-2Z"/>',
  users:
    '<circle cx="9" cy="7" r="3.7"/><path d="M2 20v-2.5a7 7 0 0 1 14 0V20Z"/><path d="M15 3.7a3.7 3.7 0 0 1 0 7.2 8.5 8.5 0 0 1 3 6.6V20h4v-2.4a6.4 6.4 0 0 0-4.5-6.1A5.8 5.8 0 0 0 15 3.7Z"/>',
  activity:
    '<path fill-rule="evenodd" d="M12 2a10 10 0 1 1-9.8 12h2.1A8 8 0 1 0 6.4 6.4L9 9H2V2l2.9 2.9A9.96 9.96 0 0 1 12 2Zm-1 4h2v6.4l4 2.3-1 1.8-5-2.9V6Z"/>',
  more: '<circle cx="5" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="19" cy="12" r="2.5"/>',
};
export function NavigationGlyph({
  name,
  color,
}: {
  name: keyof typeof paths;
  color: string;
}) {
  return (
    <SvgXml
      accessible={false}
      width={25}
      height={25}
      xml={`<svg viewBox="0 0 24 24" fill="${color}">${paths[name]}</svg>`}
    />
  );
}
