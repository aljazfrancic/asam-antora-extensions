from ast import AsyncFunctionDef
import enum
import os, sys, re, shutil
from pyquery import PyQuery
from pathlib import Path


def clean_content(content_array):
    return [line.replace("\n","").strip() for line in content_array]

# Change to grabbing <div id="list"> from index.html
# Also, consider using the id="meta" information for creating additional page and adding it to the nav file
def get_navigation_structure(source_path,fname,target_path,module_path,navigation_title):
    path = ""
    if target_path:
        path = target_path + "/"

    content = ""
    nav_content = [":sectnums!:\n"]
    nav_content.append("* "+navigation_title+"\n")
    with open(source_path+"/"+fname+".html", "r") as file:
        content = file.read()

    pq = PyQuery(content)
    nav_list = pq('body div#list')
    level1 = nav_list('font.FrameHeadingFont')
    level2 = nav_list('font.FrameItemFont')
    for i in range(len(level1)):
        nav_content.append(":sectnums!:\n")
        nav_content.append("** " + level1.eq(i).text()+"\n")
        symbols = level2.eq(i)("span.DeprecatedSymbol")
        links = level2.eq(i)('a[title="class in uml"]')
        for j in range(len(symbols)):
            link_text = links.eq(j).text()
            if symbols.eq(j).text():
                link_text = "["+symbols.eq(j).text()+"\] " + link_text
            link_path = links.eq(j).attr('href').replace("./","").replace(".html",".adoc")
            if target_path:
                link_path = target_path + "/" + link_path
            nav_content.append(":sectnums!:\n")
            nav_content.append("*** xref:{link}[{label}]\n".format(link=link_path,label=link_text))
    nav_content.append(":!sectnums:\n")
    nav_content.append("** xref:meta.adoc[Meta]")

    with open(module_path+"/nav.adoc","w") as nav:
        nav.writelines(nav_content)

    return pq('body div#meta table')

def get_meta_information(meta_query,target_path):
    html = meta_query.outer_html().split("\n")
    for i, line in enumerate(html):
        line = line.strip()
        if not line:
            html[i]="<br>"
    html_combined = "\n".join(html)

    body = "= Meta information\n:page-width-limit: none\n\n++++\n"+html_combined+"\n++++\n"

    meta_file = "meta.adoc"
    with open(target_path+"/"+meta_file, 'w') as file:
        file.write(body)
    return meta_file


def parse_file_and_create_adoc(source_path,fname,target_path):
    content = ""
    title= ""
    body= ""

    with open(source_path+"/"+fname+".html", 'r') as source_file:
        content = source_file.read()

    pq = PyQuery(content)
    title = pq('h2:first').text()
    has_title = True
    if not title:
        has_title = False
        title_start = content.find("<title>")
        title_end = content.find("</title>")
        if not title_start == title_end:
            title = content[title_start+len("<title>"):title_end]
        else:
            title = fname
    current_header = "= " + title+"\n:page-width-limit: none\n\n"
    if has_title:
        body = pq('div#contents').html().replace('<h2>{title}</h2>'.format(title=current_header),"")
    else:
        body = pq('div#contents').html()

    with open(target_path+"/"+fname+".adoc","w", encoding="utf-8") as file:
        file.write(current_header + "++++")
        file.write(body)
        file.write("\n++++\n\n")


def main(argv):
    source_path = "ASAM_OSI_reference"
    target_path = "generated"
    target_content_path = target_path + "/converted"
    module_path = "../_antora/modules/ROOT"
    img_path = "../_attachments"
    module_content_path = ""
    navigation_title = "Model definition"


    if len(argv)>=1 and argv[0]:
        target_path = argv[0]
    if len(argv)>=2 and argv[1]:
        target_content_path = argv[0]+"/"+argv[1]
    if len(argv)>=3 and argv[2]:
        module_path = argv[0]+"/"+argv[2]
    if len(argv)>=4 and argv[3]:
        img_path = argv[3]
    if len(argv)>=5 and argv[4]:
        module_content_path = argv[4]
    if len(argv)>=6 and argv[5]:
        source_path = argv[5]
    if len(argv)>=7 and argv[6]:
        navigation_title = argv[6]

    Path(target_path).mkdir(parents=True, exist_ok= True)
    Path(target_content_path).mkdir(parents=True, exist_ok= True)
    Path(module_path).mkdir(parents=True, exist_ok= True)
    for root, dirs, files in os.walk(source_path, followlinks=True):
        rel_path = os.path.relpath(root, source_path)
        rel_target_path = target_content_path
        if rel_path != ".":
            rel_target_path = "/".join([target_content_path,rel_path])
            Path(rel_target_path).mkdir(parents=True, exist_ok= True)
        for f in files:
            fname, extension = os.path.splitext(f)
            if f == "index.html":
                meta_query = get_navigation_structure(root,fname,module_content_path,module_path,navigation_title)
                get_meta_information(meta_query,rel_target_path)
            elif f == "top.html":
                continue
            if extension == ".html":
                parse_file_and_create_adoc(root,fname,rel_target_path)


if __name__ == "__main__":
   main(sys.argv[1:])
