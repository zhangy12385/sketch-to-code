export function OnboardingNote() {
  return (
    <div className="flex flex-col space-y-4 bg-green-700 p-2 rounded text-stone-200 text-sm">
      <span>
        若要使用 Sketch to Code,{" "}
        <a
          className="inline underline hover:opacity-70"
          href="https://buy.stripe.com/8wM6sre70gBW1nqaEE"
          target="_blank"
        >
          请购买积分（100 次生成 $36）
        </a>{" "}
        或使用您自己的、具备 GPT4 视觉能力的 OpenAI API 密钥。{" "}
        <a
          href="https://github.com/abi/screenshot-to-code/blob/main/Troubleshooting.md"
          className="inline underline hover:opacity-70"
          target="_blank"
        >
          请按照这些说明获取密钥。
        </a>{" "}
        然后将其粘贴到设置对话框中（上方的齿轮图标）。您的密钥仅存储在您的浏览器中，绝不会保存在我们的服务器上。
      </span>
    </div>
  );
}
