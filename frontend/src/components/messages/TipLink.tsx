import { URLS } from "../../urls";

function TipLink() {
  return (
    <a
      className="text-xs underline text-gray-500 text-right"
      href={URLS.tips}
      target="_blank"
      rel="noopener"
    >
      获取更好结果的提示
    </a>
  );
}

export default TipLink;
