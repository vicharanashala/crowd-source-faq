@echo off
pushd "c:\Users\Admin\Downloads\crowd_source_faq-main\crowd_source_faq-main"
echo === Current directory ===
cd
echo.
echo === Git remote ===
git remote -v
echo.
echo === Git status ===
git status
echo.
echo === Staging all changes ===
git add .
echo.
echo === Committing ===
git commit -m "feat: Add Ask Admin Directly, Repetition Trends, and User Management + Audit Log"
echo.
echo === Push to origin main ===
git push origin main
echo.
echo === Done ===
popd
