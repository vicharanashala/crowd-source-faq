import json
import os

log_path = r'C:\Users\sanuk\crowd-source-faq\apps\backend\transcript_full.jsonl'

model_content = None
controller_content = None

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        idx = data.get('step_index')
        # Check step 230 or any step where MOCKUP settings were written for model
        if idx == 230:
            tool_calls = data.get('tool_calls', [])
            for tc in tool_calls:
                if 'app-setting.model.ts' in str(tc):
                    model_content = tc['args'].get('CodeContent') or tc['args'].get('ReplacementContent')
                    print(f"Model content found in step {idx}")
        # Check step 281 or any step where settings were written for controller
        if idx == 281:
            content_str = data.get('content', '')
            if 'app-settings.controller.ts' in content_str:
                print(f"Controller system log found in step {idx}")
            tool_calls = data.get('tool_calls', [])
            for tc in tool_calls:
                if 'app-settings.controller.ts' in str(tc):
                    controller_content = tc['args'].get('CodeContent') or tc['args'].get('ReplacementContent')
                    print(f"Controller content found in step {idx}")

# Wait! Let's check if the file was written to in full or patched.
# If they were modified via replace_file_content or multi_replace_file_content, they won't be in one single step.
# In that case, we can look at the git status modifications and reconstruct them since they are very simple:
# - app-setting.model.ts has teeMockupUrl
# - app-settings.controller.ts has teeMockupUrl
# Let's see what was written.
print("model_content:", model_content is not None)
print("controller_content:", controller_content is not None)

if model_content:
    with open("model_output.ts", "w", encoding="utf-8") as f:
        f.write(model_content)

if controller_content:
    with open("controller_output.ts", "wgit", encoding="utf-8") as f:
        f.write(controller_content)
