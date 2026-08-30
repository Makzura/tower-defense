/* --------------------------------------------------------------------------
 * Tower Defense launcher
 *
 * Opens index.html (sitting next to this executable) in the default browser.
 * Built with -mwindows so no console window ever appears.
 *
 * Rebuild with:
 *   x86_64-w64-mingw32-gcc launcher.c -o "Play Tower Defense.exe" \
 *       -mwindows -Os -s -lshell32
 * -------------------------------------------------------------------------- */

#include <windows.h>
#include <string.h>

int WINAPI WinMain(HINSTANCE instance, HINSTANCE prev, LPSTR cmdline, int show)
{
    char path[MAX_PATH];
    char *slash;
    HINSTANCE result;

    (void)instance; (void)prev; (void)cmdline; (void)show;

    /* Find the folder this executable lives in. */
    if (GetModuleFileNameA(NULL, path, MAX_PATH) == 0) {
        MessageBoxA(NULL, "Could not determine the game folder.",
                    "Tower Defense", MB_ICONERROR | MB_OK);
        return 1;
    }

    slash = strrchr(path, '\\');
    if (slash == NULL) {
        MessageBoxA(NULL, "Could not determine the game folder.",
                    "Tower Defense", MB_ICONERROR | MB_OK);
        return 1;
    }
    *(slash + 1) = '\0';

    if (strlen(path) + strlen("index.html") >= MAX_PATH) {
        MessageBoxA(NULL, "The folder path is too long. Move the game folder "
                    "somewhere shorter, like C:\\Games.",
                    "Tower Defense", MB_ICONERROR | MB_OK);
        return 1;
    }
    strcat(path, "index.html");

    if (GetFileAttributesA(path) == INVALID_FILE_ATTRIBUTES) {
        MessageBoxA(NULL,
                    "index.html was not found.\n\n"
                    "Keep this program in the same folder as index.html "
                    "and the js folder.",
                    "Tower Defense", MB_ICONERROR | MB_OK);
        return 1;
    }

    result = ShellExecuteA(NULL, "open", path, NULL, NULL, SW_SHOWNORMAL);

    /* ShellExecute returns a value > 32 on success. */
    if ((INT_PTR)result <= 32) {
        MessageBoxA(NULL,
                    "Could not open the game in a browser.\n\n"
                    "Try opening index.html yourself by double-clicking it.",
                    "Tower Defense", MB_ICONERROR | MB_OK);
        return 1;
    }

    return 0;
}
